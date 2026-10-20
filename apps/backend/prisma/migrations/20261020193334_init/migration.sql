-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('queued', 'planning', 'investigating', 'implementing', 'verifying', 'awaiting_approval', 'publishing', 'completed', 'rejected', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "task_failure_reason" AS ENUM ('budget_exceeded', 'tests_failed', 'invalid_llm_output', 'stale_base', 'sandbox_error', 'github_error', 'guard_violation', 'internal_error');

-- CreateEnum
CREATE TYPE "github_account_type" AS ENUM ('User', 'Organization');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "display_name" TEXT,
    "github_user_id" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "replaced_by_id" UUID,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_installations" (
    "id" UUID NOT NULL,
    "installation_id" BIGINT NOT NULL,
    "account_login" TEXT NOT NULL,
    "account_type" "github_account_type" NOT NULL,
    "user_id" UUID NOT NULL,
    "suspended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "github_repo_id" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "instruction" TEXT NOT NULL,
    "base_branch" TEXT NOT NULL,
    "base_commit_sha" CHAR(40),
    "status" "task_status" NOT NULL DEFAULT 'queued',
    "version" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" "task_failure_reason",
    "failure_detail" TEXT,
    "cost_usd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "cancel_requested_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_user_id_key" ON "users"("github_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_replaced_by_id_key" ON "sessions"("replaced_by_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_installation_id_key" ON "github_installations"("installation_id");

-- CreateIndex
CREATE INDEX "github_installations_user_id_idx" ON "github_installations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_github_repo_id_key" ON "repositories"("github_repo_id");

-- CreateIndex
CREATE INDEX "repositories_installation_id_idx" ON "repositories"("installation_id");

-- CreateIndex
CREATE INDEX "repositories_owner_name_idx" ON "repositories"("owner", "name");

-- CreateIndex
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tasks_repository_id_idx" ON "tasks"("repository_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "github_installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
