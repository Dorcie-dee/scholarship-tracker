'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { Button, Popconfirm } from 'antd';
import type { ReactNode } from 'react';

/** A destructive action always confirmed in place — never a silent delete. */
export function ConfirmDeleteButton({
  title,
  description,
  onConfirm,
  loading,
  children,
  danger = true,
  size,
}: {
  title: string;
  description?: string;
  onConfirm: () => void;
  loading?: boolean;
  children?: ReactNode;
  danger?: boolean;
  size?: 'small' | 'middle' | 'large';
}) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText="Delete"
      cancelText="Cancel"
      okButtonProps={{ danger: true }}
      onConfirm={onConfirm}
      placement="topRight"
    >
      <Button
        danger={danger}
        icon={!children ? <DeleteOutlined /> : undefined}
        loading={loading}
        size={size}
        aria-label={typeof children === 'string' ? children : title}
      >
        {children}
      </Button>
    </Popconfirm>
  );
}
