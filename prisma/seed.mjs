// Seed reference data. Run: node prisma/seed.mjs   (SEED_DEMO=true adds sample people & requests)
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const D = (s) => new Date(s + "T00:00:00Z");

// Defaults follow Malaysia's Employment Act 1955 minimums (review for your company policy):
// annual 8/12/16 by service length, sick 14/18/22, hospitalisation 60, maternity 98, paternity 7.
const LEAVE_TYPES = [
  { code: "AL", name: "Annual Leave", defaultDays: 8, carryForwardMax: 5, color: "#2f6fed", sortOrder: 1 },
  { code: "MC", name: "Medical Leave", defaultDays: 14, carryForwardMax: 0, color: "#e11d48", sortOrder: 2, requiresReason: false },
  { code: "HL", name: "Hospitalisation Leave", defaultDays: 60, carryForwardMax: 0, color: "#be123c", sortOrder: 3 },
  { code: "ML", name: "Maternity Leave", defaultDays: 98, carryForwardMax: 0, color: "#db2777", sortOrder: 4 },
  { code: "PL", name: "Paternity Leave", defaultDays: 7, carryForwardMax: 0, color: "#0891b2", sortOrder: 5 },
  { code: "CL", name: "Compassionate Leave", defaultDays: 3, carryForwardMax: 0, color: "#7c3aed", sortOrder: 6, requiresReason: true },
  { code: "UL", name: "Unpaid Leave", defaultDays: 0, carryForwardMax: 0, color: "#64748b", sortOrder: 9, paid: false, requiresReason: true },
];
const CLAIM_CATS = [
  { name: "Mileage & Transport", limitPerClaim: 500 },
  { name: "Meals & Entertainment", limitPerClaim: 300 },
  { name: "Medical / Clinic", limitPerClaim: 200, medical: true },
  { name: "Parking & Toll", limitPerClaim: null },
  { name: "Office Supplies", limitPerClaim: 500 },
  { name: "Travel & Accommodation", limitPerClaim: null },
];
// Fixed-date national holidays only. Add lunar/Islamic-calendar and state holidays in Leave setup.
const HOLIDAYS = [2026, 2027].flatMap((y) => [
  [`${y}-05-01`, "Labour Day"],
  [`${y}-08-31`, "National Day"],
  [`${y}-09-16`, "Malaysia Day"],
  [`${y}-12-25`, "Christmas Day"],
]);

async function main() {
  // Reference data is only inserted on first boot so admin edits/removals stick across restarts.
  if ((await db.leaveType.count()) > 0 && process.env.SEED_DEMO !== "true") {
    console.log("Reference data already present; skipping seed.");
    return;
  }
  for (const t of LEAVE_TYPES) await db.leaveType.upsert({ where: { code: t.code }, create: t, update: {} });
  for (const c of CLAIM_CATS) await db.claimCategory.upsert({ where: { name: c.name }, create: c, update: {} });
  for (const [d, name] of HOLIDAYS) await db.holiday.upsert({ where: { date: D(d) }, create: { date: D(d), name }, update: {} });
  console.log(`Seeded ${LEAVE_TYPES.length} leave types, ${CLAIM_CATS.length} claim categories, ${HOLIDAYS.length} holidays.`);

  if (process.env.SEED_DEMO !== "true") return;
  const dept = async (name) => db.department.upsert({ where: { name }, create: { name }, update: {} });
  const [ops, acad, sales] = await Promise.all([dept("Operations"), dept("Academic"), dept("Sales")]);
  const user = (email, name, role, departmentId, jobTitle, managerId = null) =>
    db.user.upsert({ where: { email }, create: { email, name, role, departmentId, jobTitle, managerId, joinDate: D("2024-03-01") }, update: {} });
  const admin = await user("admin@example.com", "Aisyah Rahman", "ADMIN", ops.id, "HR Manager");
  const mgr = await user("manager@example.com", "Daniel Tan", "MANAGER", acad.id, "Academic Head", admin.id);
  const e1 = await user("employee@example.com", "Priya Nair", "EMPLOYEE", acad.id, "English Teacher", mgr.id);
  const e2 = await user("hafiz@example.com", "Hafiz Ismail", "EMPLOYEE", acad.id, "English Teacher", mgr.id);
  await user("mei@example.com", "Mei Ling Wong", "EMPLOYEE", sales.id, "Student Advisor", admin.id);

  const al = await db.leaveType.findUnique({ where: { code: "AL" } });
  const mc = await db.leaveType.findUnique({ where: { code: "MC" } });
  const year = new Date().getUTCFullYear();
  if ((await db.leaveRequest.count()) === 0) {
    await db.leaveRequest.createMany({ data: [
      { userId: e1.id, leaveTypeId: al.id, startDate: D(`${year}-12-28`), endDate: D(`${year}-12-30`), days: 3, reason: "Family trip to Penang" },
      { userId: e2.id, leaveTypeId: mc.id, startDate: D(`${year}-11-10`), endDate: D(`${year}-11-10`), days: 1, status: "APPROVED", approverId: mgr.id, decidedAt: new Date() },
      { userId: mgr.id, leaveTypeId: al.id, startDate: D(`${year}-12-21`), endDate: D(`${year}-12-22`), days: 2, reason: "Year-end break" },
    ] });
  }
  const cat = await db.claimCategory.findUnique({ where: { name: "Mileage & Transport" } });
  if ((await db.claim.count()) === 0) {
    await db.claim.create({ data: { userId: e1.id, categoryId: cat.id, amount: 42.5, expenseDate: D(`${year}-11-03`), description: "Grab to Shah Alam branch for placement test" } });
  }
  console.log("Demo data added: admin@example.com, manager@example.com, employee@example.com (use DEMO_LOGIN=true to sign in as them).");
}

main().finally(() => db.$disconnect());
