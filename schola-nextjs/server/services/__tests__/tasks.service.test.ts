import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { ApplicationJourney } from '../../models/application-journey.model';
import { Application } from '../../models/application.model';
import { Task } from '../../models/task.model';
import { TaskStatus } from '../../lib/enums';
import { BadRequestError, NotFoundError } from '../../lib/http-errors';
import { createJourney } from '../journeys.service';
import { createApplication } from '../applications.service';
import {
  createTask,
  findTaskAccessible,
  listTasks,
  updateTask,
} from '../tasks.service';

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

async function makeJourney(ownerId = userId) {
  return createJourney(ownerId, { title: 'MSc Computer Science' });
}

async function makeApplication(journeyId: string, ownerId = userId) {
  return createApplication(ownerId, { journeyId, title: 'App' });
}

describe('tasks.service', () => {
  describe('dependency scope validation', () => {
    it('allows a journey-level task to depend on another journey-level task in the same journey', async () => {
      const journey = await makeJourney();
      const dependency = await createTask(userId, { journeyId: String(journey._id), title: 'Research' });
      const dependent = await createTask(userId, {
        journeyId: String(journey._id),
        title: 'Draft SOP',
        dependsOnTaskId: String(dependency._id),
      });
      expect(String(dependent.dependsOnTaskId)).toBe(String(dependency._id));
    });

    it('rejects a journey-level task depending on an application-scoped task', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      const scoped = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(application._id),
        title: 'Submit form',
      });

      await expect(
        createTask(userId, {
          journeyId: String(journey._id),
          title: 'Journey-level task',
          dependsOnTaskId: String(scoped._id),
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects an application-scoped task depending on a task from a different application', async () => {
      const journey = await makeJourney();
      const applicationA = await makeApplication(String(journey._id));
      const applicationB = await makeApplication(String(journey._id));
      const taskInA = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(applicationA._id),
        title: 'Task A',
      });

      await expect(
        createTask(userId, {
          journeyId: String(journey._id),
          applicationId: String(applicationB._id),
          title: 'Task B',
          dependsOnTaskId: String(taskInA._id),
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('allows an application-scoped task to depend on another task in the same application', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      const first = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(application._id),
        title: 'First',
      });
      const second = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(application._id),
        title: 'Second',
        dependsOnTaskId: String(first._id),
      });
      expect(String(second.dependsOnTaskId)).toBe(String(first._id));
    });

    it('rejects a task depending on itself (on update)', async () => {
      const journey = await makeJourney();
      const task = await createTask(userId, { journeyId: String(journey._id), title: 'Solo' });

      await expect(
        updateTask(String(task._id), userId, { dependsOnTaskId: String(task._id) }),
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects a cross-journey dependency target', async () => {
      const journeyA = await makeJourney();
      const journeyB = await makeJourney();
      const taskInB = await createTask(userId, { journeyId: String(journeyB._id), title: 'In B' });

      await expect(
        createTask(userId, {
          journeyId: String(journeyA._id),
          title: 'In A',
          dependsOnTaskId: String(taskInB._id),
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('status: done auto-stamps completedAt', () => {
    it('sets completedAt when status transitions to done', async () => {
      const journey = await makeJourney();
      const task = await createTask(userId, { journeyId: String(journey._id), title: 'Write SOP' });
      expect(task.completedAt).toBeNull();

      const updated = await updateTask(String(task._id), userId, { status: TaskStatus.DONE });
      expect(updated.completedAt).not.toBeNull();
    });

    it('clears completedAt when status moves away from done', async () => {
      const journey = await makeJourney();
      const task = await createTask(userId, { journeyId: String(journey._id), title: 'Write SOP' });
      const done = await updateTask(String(task._id), userId, { status: TaskStatus.DONE });
      expect(done.completedAt).not.toBeNull();

      const reopened = await updateTask(String(task._id), userId, { status: TaskStatus.IN_PROGRESS });
      expect(reopened.completedAt).toBeNull();
    });

    it('does not overwrite an already-set completedAt on a redundant done -> done update', async () => {
      const journey = await makeJourney();
      const task = await createTask(userId, { journeyId: String(journey._id), title: 'Write SOP' });
      const done = await updateTask(String(task._id), userId, { status: TaskStatus.DONE });
      const firstCompletedAt = done.completedAt;

      const doneAgain = await updateTask(String(task._id), userId, { status: TaskStatus.DONE });
      expect(doneAgain.completedAt?.getTime()).toBe(firstCompletedAt?.getTime());
    });
  });

  describe('visibility — soft-deleted Application exclusion', () => {
    it('excludes a task whose applicationId points at a soft-deleted Application from list', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      const task = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(application._id),
        title: 'Scoped task',
      });
      const journeyLevelTask = await createTask(userId, {
        journeyId: String(journey._id),
        title: 'Journey-level task',
      });

      await Application.updateOne({ _id: application._id }, { $set: { deletedAt: new Date() } });

      const page = await listTasks(userId, { journeyId: String(journey._id) }, {});
      const ids = page.items.map((t) => String(t._id));
      expect(ids).not.toContain(String(task._id));
      expect(ids).toContain(String(journeyLevelTask._id));
    });

    it('excludes a task whose applicationId points at a soft-deleted Application from get', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      const task = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(application._id),
        title: 'Scoped task',
      });

      await Application.updateOne({ _id: application._id }, { $set: { deletedAt: new Date() } });

      await expect(findTaskAccessible(String(task._id), userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('ownership', () => {
    it('404s creating a task against a journey owned by another user', async () => {
      const journey = await makeJourney(otherUserId);
      await expect(
        createTask(userId, { journeyId: String(journey._id), title: 'Mine?' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('404s fetching a task owned by another user', async () => {
      const journey = await makeJourney(otherUserId);
      const task = await createTask(otherUserId, { journeyId: String(journey._id), title: 'Theirs' });
      await expect(findTaskAccessible(String(task._id), userId)).rejects.toThrow(NotFoundError);
    });
  });
});
