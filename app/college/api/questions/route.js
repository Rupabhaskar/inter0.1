import { NextResponse } from "next/server";
import { getDoc, getDocs, collection, doc } from "firebase/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { questionDb } from "@/lib/firebaseQuestionDb";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100;

const cache = new Map();
const cacheTimes = new Map();

function getCacheKey(collegeCode, testId) {
  return `${String(collegeCode).trim()}:${String(testId).trim()}`;
}

function getCached(key) {
  const at = cacheTimes.get(key);
  if (!at || Date.now() - at > CACHE_TTL_MS) return null;
  return cache.get(key) ?? null;
}

function setCache(key, value) {
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
 * GET /college/api/questions?testId=xxx
 * Headers: Authorization: Bearer <Firebase ID token>
 *
 * Returns test + questions (cached per collegeCode:testId). First request does 1 (ids) + 51 (test+questions) reads;
 * subsequent requests for same test get cache (0 extra Firestore reads for test+questions).
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
    const uid = decoded.uid;

    // 1 read: get student's college from primary db (students/{collegeCode}/ids via collection group)
    const idsSnap = await adminDb
      .collectionGroup("ids")
      .where("uid", "==", uid)
      .limit(1)
      .get();

    if (idsSnap.empty) {
      return NextResponse.json({ error: "Student record not found" }, { status: 404 });
    }

    const studentDoc = idsSnap.docs[0];
    const studentData = studentDoc.data();
    const collegeCode =
      studentData.college != null && String(studentData.college).trim() !== ""
        ? String(studentData.college).trim()
        : studentDoc.ref.parent.parent.id;

    const studentName = studentData.name != null ? String(studentData.name).trim() : "";
    const studentClass =
      studentData.course != null && String(studentData.course).trim() !== ""
        ? String(studentData.course).trim()
        : studentData.class != null
          ? String(studentData.class).trim()
          : "";

    const cacheKey = getCacheKey(collegeCode, testId);
    let cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        collegeCode,
        studentName,
        studentClass,
      });
    }

    // Cache miss: 1 + N reads on questionDb (second project)
    const [testSnap, qSnap] = await Promise.all([
      getDoc(doc(questionDb, collegeCode, testId)),
      getDocs(collection(questionDb, collegeCode, testId, "questions")),
    ]);

    if (!testSnap.exists()) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    const testData = testSnap.data();
    const questionsData = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    setCache(cacheKey, { test: testData, questions: questionsData });

    return NextResponse.json({
      test: testData,
      questions: questionsData,
      collegeCode,
      studentName,
      studentClass,
    });
  } catch (err) {
    console.error("college/api/questions error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
