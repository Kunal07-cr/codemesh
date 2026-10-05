import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("Password123!");

  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: {
      email: "owner@example.com",
      passwordHash,
      displayName: "Sample Owner",
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@example.com" },
    update: {},
    create: {
      email: "viewer@example.com",
      passwordHash,
      displayName: "Sample Viewer",
    },
  });

  const project = await prisma.project.upsert({
    where: { slug: "sample-project" },
    update: {},
    create: {
      slug: "sample-project",
      name: "Sample Project",
      description:
        "Seeded project so the portal is explorable without connecting GitHub. Content here is labeled as sample data, per the product spec.",
      languages: ["TypeScript", "JavaScript"],
      tags: ["sample", "demo"],
      visibility: "PUBLIC",
      sourceKind: "ZIP_UPLOAD",
      published: true,
      createdById: owner.id,
    },
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: owner.id } },
    update: { role: "OWNER" },
    create: { projectId: project.id, userId: owner.id, role: "OWNER" },
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: viewer.id } },
    update: { role: "VIEWER" },
    create: { projectId: project.id, userId: viewer.id, role: "VIEWER" },
  });

  console.log("Seed complete:");
  console.log("  owner@example.com / Password123!  (OWNER on sample-project)");
  console.log("  viewer@example.com / Password123! (VIEWER on sample-project)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
