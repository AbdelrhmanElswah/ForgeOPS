-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "event_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "agent_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_events_task_id_seq_key" ON "agent_events"("task_id", "seq");

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
