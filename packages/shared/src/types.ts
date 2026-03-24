import type { MembershipRole, MembershipStatus, ChargeCategory, ChargeStatus, PaymentSource } from './constants';

// Base types
export interface Organization {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  name: string | null;
  paymentAliases: string[];
  joinedAt: Date;
  leftAt: Date | null;
  invitedEmail: string | null;
  inviteExpiresAt: Date | null;
}

export interface Charge {
  id: string;
  orgId: string;
  membershipId: string | null;
  category: ChargeCategory;
  title: string;
  amountCents: number;
  dueDate: Date | null;
  status: ChargeStatus;
  createdById: string;
  createdAt: Date;
  parentId?: string | null;
}

export interface Payment {
  id: string;
  orgId: string;
  amountCents: number;
  paidAt: Date;
  source: PaymentSource;
  rawPayerName: string | null;
  memo: string | null;
  externalId: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface PaymentAllocation {
  id: string;
  orgId: string;
  paymentId: string;
  chargeId: string;
  amountCents: number;
  createdById: string;
  createdAt: Date;
}

// Extended types with relations
export interface MemberWithBalance extends Membership {
  displayName: string;
  balanceCents: number;
  totalChargedCents: number;
  totalPaidCents: number;
  overdueCharges: number;
  inviteExpired?: boolean;
  user?: User | null;
}

export interface MemberDetail extends MemberWithBalance {
  charges: Array<{
    id: string;
    category: string;
    title: string;
    amountCents: number;
    dueDate: string | null;
    status: string;
    createdAt: string;
    allocatedCents: number;
    balanceDueCents: number;
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    paidAt: string;
    source: string;
    memo?: string | null;
    allocations: Array<{
      id: string;
      amountCents: number;
      chargeId: string;
      chargeTitle: string;
    }>;
  }>;
}

export interface ChargeWithMember extends Charge {
  membership: {
    id: string;
    name: string | null;
    user?: { name: string | null } | null;
  } | null;
  balanceDueCents: number;
  allocatedCents: number;
  children?: ChargeWithMember[];
}

export interface PaymentWithAllocations extends Payment {
  allocations: PaymentAllocation[];
  allocatedCents: number;
  unallocatedCents: number;
}

// Dashboard
export interface DashboardStats {
  totalOutstandingCents: number;
  totalCollectedCents: number;
  overdueCount: number;
  memberCount: number;
  openChargesCount: number;
  recentPayments: PaymentWithAllocations[];
  recentActivity: { paymentsLast24h: number; newMembersLast24h: number };
}

// Auth
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  memberships: {
    id: string;
    orgId: string;
    orgName: string;
    role: MembershipRole;
    status: MembershipStatus;
  }[];
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
}
