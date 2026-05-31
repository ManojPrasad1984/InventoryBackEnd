// Role-based access control
// Role hierarchy: admin > manager > sales_rep > driver

const ROLE_WEIGHT: Record<string, number> = {
  admin:     4,
  manager:   3,
  sales_rep: 2,
  driver:    1,
};

// Returns true if userRole satisfies at least one of the allowed roles
export function validateRole(userRole: string, allowedRoles: string[]): boolean {
  const userWeight = ROLE_WEIGHT[userRole] ?? 0;
  return allowedRoles.some((r) => userWeight >= (ROLE_WEIGHT[r] ?? 0));
}
