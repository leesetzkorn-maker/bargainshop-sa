import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
db.product
  .findMany({
    where: { itemId: { gte: "2DS-0079", lte: "2DS-0089" } },
    select: { itemId: true, status: true, images: { select: { id: true, url: true, coverMode: true, maskBoxes: true, sortOrder: true } } },
  })
  .then((rows) => {
    rows.forEach((x) => {
      console.log(x.itemId, x.status);
      x.images.forEach((i) => console.log("  ", i.sortOrder, i.url, i.coverMode, i.maskBoxes ? i.maskBoxes.slice(0, 110) : "-"));
    });
    return db.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
