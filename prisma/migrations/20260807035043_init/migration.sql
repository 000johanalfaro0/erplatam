-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PIECE', 'KG', 'G', 'L', 'ML', 'BOX', 'PACK', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'RECEIVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INITIAL', 'ENTRY', 'EXIT', 'ADJUSTMENT', 'SALE', 'PURCHASE', 'RETURN', 'SALE_VOID', 'PURCHASE_VOID');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'IMPLEMENTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "FeedbackPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('COMMENT', 'NEW_ELEMENT', 'BUG', 'IDEA');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "rfc" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "locale" TEXT NOT NULL DEFAULT 'es-MX',
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "defaultTaxRateBps" INTEGER NOT NULL DEFAULT 1600,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5000,
    "satRegimenFiscal" TEXT,
    "satPostalCode" TEXT,
    "cfdiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresChange" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "rfc" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "supplierId" TEXT,
    "taxRateId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'PIECE',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "satProductCode" TEXT,
    "satUnitCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "rfc" TEXT,
    "legalName" TEXT,
    "satRegimenFiscal" TEXT,
    "satUsoCfdi" TEXT,
    "satPostalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "customerId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "receivedCents" INTEGER,
    "changeCents" INTEGER,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "supplierId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'RECEIVED',
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "invoiceNumber" TEXT,
    "notes" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "unitCostCents" INTEGER,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT,
    "paymentMethodId" TEXT,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL DEFAULT 'COMMENT',
    "priority" "FeedbackPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "route" TEXT NOT NULL,
    "elementLabel" TEXT,
    "elementPath" TEXT,
    "anchorRect" JSONB,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "proposedElement" TEXT,
    "internalNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackScreenshot" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryResponse" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "formVersion" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSettings_businessId_key" ON "BusinessSettings"("businessId");

-- CreateIndex
CREATE INDEX "TaxRate_businessId_deletedAt_idx" ON "TaxRate"("businessId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_businessId_name_key" ON "TaxRate"("businessId", "name");

-- CreateIndex
CREATE INDEX "PaymentMethod_businessId_isActive_idx" ON "PaymentMethod"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_businessId_code_key" ON "PaymentMethod"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCounter_businessId_docType_key" ON "DocumentCounter"("businessId", "docType");

-- CreateIndex
CREATE UNIQUE INDEX "Role_businessId_key_key" ON "Role"("businessId", "key");

-- CreateIndex
CREATE INDEX "User_businessId_deletedAt_idx" ON "User"("businessId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_businessId_email_key" ON "User"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Category_businessId_deletedAt_idx" ON "Category"("businessId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessId_name_key" ON "Category"("businessId", "name");

-- CreateIndex
CREATE INDEX "Supplier_businessId_deletedAt_idx" ON "Supplier"("businessId", "deletedAt");

-- CreateIndex
CREATE INDEX "Supplier_businessId_name_idx" ON "Supplier"("businessId", "name");

-- CreateIndex
CREATE INDEX "Product_businessId_deletedAt_status_idx" ON "Product"("businessId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "Product_businessId_name_idx" ON "Product"("businessId", "name");

-- CreateIndex
CREATE INDEX "Product_businessId_categoryId_idx" ON "Product"("businessId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_sku_key" ON "Product"("businessId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_barcode_key" ON "Product"("businessId", "barcode");

-- CreateIndex
CREATE INDEX "Customer_businessId_deletedAt_idx" ON "Customer"("businessId", "deletedAt");

-- CreateIndex
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Sale_businessId_createdAt_idx" ON "Sale"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_businessId_status_createdAt_idx" ON "Sale"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_businessId_folio_key" ON "Sale"("businessId", "folio");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Purchase_businessId_purchasedAt_idx" ON "Purchase"("businessId", "purchasedAt");

-- CreateIndex
CREATE INDEX "Purchase_businessId_status_idx" ON "Purchase"("businessId", "status");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_businessId_folio_key" ON "Purchase"("businessId", "folio");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_createdAt_idx" ON "InventoryMovement"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_type_createdAt_idx" ON "InventoryMovement"("businessId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_saleId_idx" ON "InventoryMovement"("saleId");

-- CreateIndex
CREATE INDEX "InventoryMovement_purchaseId_idx" ON "InventoryMovement"("purchaseId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_businessId_deletedAt_idx" ON "ExpenseCategory"("businessId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_businessId_name_key" ON "ExpenseCategory"("businessId", "name");

-- CreateIndex
CREATE INDEX "Expense_businessId_spentAt_idx" ON "Expense"("businessId", "spentAt");

-- CreateIndex
CREATE INDEX "Expense_businessId_deletedAt_idx" ON "Expense"("businessId", "deletedAt");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_idx" ON "AuditLog"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_action_createdAt_idx" ON "AuditLog"("businessId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackItem_businessId_status_priority_idx" ON "FeedbackItem"("businessId", "status", "priority");

-- CreateIndex
CREATE INDEX "FeedbackItem_businessId_createdAt_idx" ON "FeedbackItem"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackItem_businessId_route_idx" ON "FeedbackItem"("businessId", "route");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackScreenshot_feedbackId_key" ON "FeedbackScreenshot"("feedbackId");

-- CreateIndex
CREATE INDEX "DiscoveryResponse_businessId_createdAt_idx" ON "DiscoveryResponse"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCounter" ADD CONSTRAINT "DocumentCounter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackScreenshot" ADD CONSTRAINT "FeedbackScreenshot_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "FeedbackItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryResponse" ADD CONSTRAINT "DiscoveryResponse_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
