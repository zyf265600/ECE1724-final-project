-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Voice" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('CREATED', 'LIVE', 'SCORING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('INTERVIEWER', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('TECHNICAL_DEPTH', 'TRADE_OFFS', 'RESULTS_VALIDATION', 'PERSONAL_CONTRIBUTION', 'CLARITY');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "voice" "Voice" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "text" TEXT NOT NULL,
    "audioKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "skill" "Skill" NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "quote" TEXT,
    "turnId" TEXT,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_createdAt_idx" ON "Interview"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_interviewId_index_key" ON "Turn"("interviewId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Report_interviewId_key" ON "Report"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_reportId_skill_key" ON "Score"("reportId", "skill");

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
