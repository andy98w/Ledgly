-- Add OWNER value to MembershipRole enum before ADMIN
ALTER TYPE "MembershipRole" ADD VALUE 'OWNER' BEFORE 'ADMIN';

-- Promote the earliest active admin in each org to OWNER
UPDATE memberships SET role = 'OWNER'
WHERE id IN (
  SELECT DISTINCT ON (org_id) id
  FROM memberships
  WHERE role = 'ADMIN' AND status = 'ACTIVE'
  ORDER BY org_id, joined_at ASC
);
