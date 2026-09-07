-- AlterTable
ALTER TABLE "user" ADD COLUMN     "permissions_granted" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permissions_revoked" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "role_permission" (
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role","permission")
);
