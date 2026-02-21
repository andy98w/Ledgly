import { z } from 'zod';
import { MEMBERSHIP_ROLES, MEMBERSHIP_STATUSES, CHARGE_CATEGORIES, CHARGE_STATUSES } from './constants';

// Auth schemas
export const sendMagicLinkSchema = z.object({
  email: z.string().email('Invalid email address'),
});
export type SendMagicLinkDto = z.infer<typeof sendMagicLinkSchema>;

export const verifyMagicLinkSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});
export type VerifyMagicLinkDto = z.infer<typeof verifyMagicLinkSchema>;

// Organization schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  timezone: z.string().default('America/New_York'),
});
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().optional(),
});
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

// Member schemas
export const createMemberSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(MEMBERSHIP_ROLES).default('MEMBER'),
});
export type CreateMemberDto = z.infer<typeof createMemberSchema>;

export const createMembersBulkSchema = z.object({
  members: z.array(createMemberSchema).min(1, 'At least one member is required'),
});
export type CreateMembersBulkDto = z.infer<typeof createMembersBulkSchema>;

export const updateMemberSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(MEMBERSHIP_ROLES).optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});
export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;

// Charge schemas
export const createChargeSchema = z.object({
  membershipIds: z.array(z.string()).min(1, 'At least one member is required'),
  category: z.enum(CHARGE_CATEGORIES),
  title: z.string().min(1, 'Title is required').max(200),
  amountCents: z.number().int().positive('Amount must be positive'),
  dueDate: z.string().datetime().optional().nullable(),
});
export type CreateChargeDto = z.infer<typeof createChargeSchema>;

export const updateChargeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amountCents: z.number().int().positive().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(CHARGE_STATUSES).optional(),
});
export type UpdateChargeDto = z.infer<typeof updateChargeSchema>;

// Payment schemas
export const createPaymentSchema = z.object({
  membershipId: z.string().optional(), // Optional if payer is unknown
  amountCents: z.number().int().positive('Amount must be positive'),
  paidAt: z.string().datetime(),
  rawPayerName: z.string().max(200).optional(),
  memo: z.string().max(500).optional(),
});
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

export const allocatePaymentSchema = z.object({
  allocations: z.array(
    z.object({
      chargeId: z.string(),
      amountCents: z.number().int().positive(),
    })
  ).min(1, 'At least one allocation is required'),
});
export type AllocatePaymentDto = z.infer<typeof allocatePaymentSchema>;

// Query schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationDto = z.infer<typeof paginationSchema>;

export const chargeFiltersSchema = z.object({
  status: z.enum(CHARGE_STATUSES).optional(),
  category: z.enum(CHARGE_CATEGORIES).optional(),
  membershipId: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
}).merge(paginationSchema);
export type ChargeFiltersDto = z.infer<typeof chargeFiltersSchema>;

export const memberFiltersSchema = z.object({
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  hasBalance: z.coerce.boolean().optional(),
  search: z.string().optional(),
}).merge(paginationSchema);
export type MemberFiltersDto = z.infer<typeof memberFiltersSchema>;

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
