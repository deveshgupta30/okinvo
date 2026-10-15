-- Local analytics (addendum §2 item 19): one counter per screen per UTC day, nothing personal.
CREATE TABLE "PageView" (
    "day" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("day","path")
);
