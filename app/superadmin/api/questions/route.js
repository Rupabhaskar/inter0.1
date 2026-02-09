import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

const TESTS_COLLECTION = "superadminTests";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100;

const cache = new Map();
const cacheTimes = new Map();

function getCached(testId) {
  const key = String(testId).trim();
  const at = cacheTimes.get(key);
  if (!at || Date.now() - at > CACHE_TTL_MS) return null;
  return cache.get(key) ?? null;
}

function setCache(testId, value) {
  const key = String(testId).trim();
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = [...cacheTimes.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) {
      cache.delete(oldest[0]);
      cacheTimes.delete(oldest[0]);
    }
  }
  cache.set(key, value);
  cacheTimes.set(key, Date.now());
}

/**
 * GET /superadmin/api/questions?testId=xxx
 * Headers: Authorization: Bearer <Firebase ID token>
 *
 * Returns test + questions (cached per testId). First request does 1 + N reads;
 * subsequent requests get cache (0 Firestore reads).
 */
export async function GET(req) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const testId = searchParams.get("testId");
    if (!testId || !String(testId).trim()) {
      return NextResponse.json({ error: "testId required" }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const cached = getCached(testId);
    if (cached) {
      return NextResponse.json(cached);
    }

    const testRef = adminDb.collection(TESTS_COLLECTION).doc(testId);
    const questionsRef = testRef.collection("questions");

    const [testSnap, qSnap] = await Promise.all([
      testRef.get(),
      questionsRef.get(),
    ]);

    if (!testSnap.exists) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    const testData = testSnap.data();
    const questionsData = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (questionsData.length === 0) {
      return NextResponse.json({ error: "No questions" }, { status: 404 });
    }

    const payload = { test: testData, questions: questionsData };
    setCache(testId, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("superadmin/api/questions error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
