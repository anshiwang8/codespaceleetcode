import { afterAll, inject } from "vitest";
import { closePool } from "@/lib/server/db";

const url = inject("testDatabaseUrl");
if (url) process.env.DATABASE_URL = url;

afterAll(closePool);
