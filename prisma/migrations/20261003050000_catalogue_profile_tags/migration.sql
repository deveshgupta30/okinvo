-- CreateTable
CREATE TABLE "_IssuerProfileToServiceItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IssuerProfileToServiceItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_IssuerProfileToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IssuerProfileToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_IssuerProfileToServiceItem_B_index" ON "_IssuerProfileToServiceItem"("B");

-- CreateIndex
CREATE INDEX "_IssuerProfileToProduct_B_index" ON "_IssuerProfileToProduct"("B");

-- AddForeignKey
ALTER TABLE "_IssuerProfileToServiceItem" ADD CONSTRAINT "_IssuerProfileToServiceItem_A_fkey" FOREIGN KEY ("A") REFERENCES "IssuerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssuerProfileToServiceItem" ADD CONSTRAINT "_IssuerProfileToServiceItem_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssuerProfileToProduct" ADD CONSTRAINT "_IssuerProfileToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "IssuerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssuerProfileToProduct" ADD CONSTRAINT "_IssuerProfileToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

