import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding…");

  // Config singleton
  await prisma.config.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: "I.S Painting Corp.",
      companyPhone: "(555) 123-4567",
      companyEmail: "info@ispainting.com",
      googleReviewUrl: "https://g.page/r/your-business/review",
    },
  });

  // Admin
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@ispainting.com" },
    update: {},
    create: {
      email: "admin@ispainting.com",
      name: "Italo Santos",
      password: adminPassword,
      role: "admin",
      hourlyRate: 0,
    },
  });

  // Employee
  const empPassword = await bcrypt.hash("painter123", 10);
  const painter = await prisma.user.upsert({
    where: { email: "painter@ispainting.com" },
    update: {},
    create: {
      email: "painter@ispainting.com",
      name: "Sample Painter",
      password: empPassword,
      role: "employee",
      hourlyRate: 28,
    },
  });

  // Customers
  const c1 = await prisma.customer.create({
    data: {
      name: "Jane Homeowner",
      email: "jane@example.com",
      phone: "(555) 222-3333",
      address: "123 Maple St",
      city: "Norwalk",
      state: "CT",
      zipCode: "06850",
      source: "google_ads",
      tags: ["residential", "interior"],
    },
  });

  await prisma.customer.create({
    data: {
      name: "Acme Property Mgmt",
      email: "ops@acme.example",
      phone: "(555) 999-1010",
      city: "Stamford",
      state: "CT",
      tags: ["commercial"],
    },
  });

  // Opportunity
  await prisma.opportunity.create({
    data: {
      customerId: c1.id,
      name: "Living room + hallway repaint",
      pipeline: "sales",
      stage: "new_lead",
      status: "open",
      leadValue: 4200,
      source: "google_ads",
      assignedToId: admin.id,
    },
  });

  // Job
  const job = await prisma.job.create({
    data: {
      customerId: c1.id,
      estimateNumber: "EST-0001",
      name: "Interior repaint — Maple St",
      status: "estimate",
      jobType: "interior",
      address: "123 Maple St",
      city: "Norwalk",
      state: "CT",
      zipCode: "06850",
      scopeOfWork: "Repaint walls, ceilings, trim in living room and hallway.",
      materialsBudget: 600,
      laborBudget: 1800,
      wcPercent: 17.5,
      glPercent: 7.5,
      overheadPercent: 12,
      markupPercent: 27,
      taxPercent: 0,
      subtotalBeforeMarkup: 2400,
      totalEstimate: 3528,
    },
  });

  await prisma.employeeJobAssignment.create({
    data: { userId: painter.id, jobId: job.id },
  });

  // Inventory
  await prisma.inventoryItem.createMany({
    data: [
      { name: "SW Cashmere — Eggshell", category: "paint", unit: "gallon", costPerUnit: 52, currentStock: 24, minStockLevel: 6 },
      { name: "Zinsser BIN Primer", category: "primer", unit: "gallon", costPerUnit: 38, currentStock: 8, minStockLevel: 3 },
      { name: "FrogTape 1.88in", category: "tape", unit: "roll", costPerUnit: 7, currentStock: 18, minStockLevel: 6 },
    ],
  });

  // Automation templates
  const templates: { name: any; displayName: string; trigger: string }[] = [
    { name: "follow_up", displayName: "Follow Up", trigger: "stage_change:follow_up" },
    { name: "not_answered", displayName: "Not Answered", trigger: "stage_change:not_answered" },
    { name: "review_request", displayName: "Review Request", trigger: "stage_change:review" },
    { name: "form_submit", displayName: "Form Submit", trigger: "form_submitted" },
  ];
  for (const t of templates) {
    await prisma.automationTemplate.upsert({
      where: { name: t.name },
      update: {},
      create: {
        name: t.name,
        displayName: t.displayName,
        trigger: t.trigger,
        steps: {
          create: [
            { stepNumber: 1, channel: "sms", delayMinutes: 0, messageContent: `Hi {{first_name}}, this is I.S Painting following up on your project.` },
            { stepNumber: 2, channel: "sms", delayMinutes: 60 * 24, messageContent: `Hi {{first_name}}, just checking in — let us know if you have any questions!` },
          ],
        },
      },
    });
  }

  console.log("✅ Done. Login: admin@ispainting.com / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
