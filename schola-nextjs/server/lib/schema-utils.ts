/**
 * Shared schema options for every model: `timestamps: true` gives every
 * document `createdAt`/`updatedAt` (the Mongo equivalent of the original
 * Postgres `BaseEntity`'s columns), and the `toJSON`/`toObject` transforms
 * rewrite `_id` (an ObjectId) to a plain string `id` and drop `__v` — so
 * every API response shape matches the original UUID-based `id` field
 * exactly and the ported frontend needs no field-name changes.
 *
 * Deliberately untyped as `SchemaOptions` (which would pin its generic
 * parameters to `unknown`/`{}` and then fail to structurally match every
 * model's own `new Schema<XDoc>(..., baseSchemaOptions)` call) — passed as a
 * plain object, Mongoose's own generic inference at each call site handles it.
 */
export const baseSchemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
};
