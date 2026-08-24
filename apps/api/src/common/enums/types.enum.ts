/**
 * Application-level enums. `RoleType` mirrors the DB's configurable roles
 * (roles are stored as records; this is the allowed key set). Importing
 * RoleType from @prisma/client is avoided because Prisma only emits enums
 * that are referenced by a model field.
 */
export const RoleType = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TEAM_LEADER: 'TEAM_LEADER',
  AGENT: 'AGENT',
  QA: 'QA',
  DISPATCHER: 'DISPATCHER',
  FINANCE: 'FINANCE',
  SUPPORT: 'SUPPORT',
  DELIVERY: 'DELIVERY',
  VIEWER: 'VIEWER',
} as const;

export type RoleType = (typeof RoleType)[keyof typeof RoleType];

export const LeadStatus = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  CALLING: 'CALLING',
  INTERESTED: 'INTERESTED',
  NO_ANSWER: 'NO_ANSWER',
  BUSY: 'BUSY',
  WRONG_NUMBER: 'WRONG_NUMBER',
  CALL_BACK_REQUESTED: 'CALL_BACK_REQUESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  ORDER_CREATED: 'ORDER_CREATED',
  CONVERTED: 'CONVERTED',
  CANCELLED: 'CANCELLED',
  INVALID_NUMBER: 'INVALID_NUMBER',
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const AssignmentStrategy = {
  MANUAL: 'MANUAL',
  ROUND_ROBIN: 'ROUND_ROBIN',
  LEAST_BUSY: 'LEAST_BUSY',
  SKILL_BASED: 'SKILL_BASED',
  LANGUAGE_BASED: 'LANGUAGE_BASED',
  LOCATION_BASED: 'LOCATION_BASED',
  VIP_QUEUE: 'VIP_QUEUE',
} as const;

export type AssignmentStrategy = (typeof AssignmentStrategy)[keyof typeof AssignmentStrategy];

export const NotificationType = {
  PUSH: 'PUSH',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];