"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, onSnapshot } from "firebase/firestore";
function sortMessages(list) {
  return [...list].sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
    const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
    return ta - tb;
  });
}
import { auth, db } from "@/lib/firebase";
import Link from "next/link";

export default function SupportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [collegeCode, setCollegeCode] = useState("");
  const [collegeName, setCollegeName] = useState("");

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const [myTickets, setMyTickets] = useState([]);
  const [ticketMessagesMap, setTicketMessagesMap] = useState({});
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [showRaiseForm, setShowRaiseForm] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/college");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          router.replace("/college");
          setLoading(false);
          return;
        }
        const data = snap.data();
        const role = data.role || "";
        const isAdmin = role === "collegeAdmin";

        setUserRole(role);
        setUserName((data.name || "").trim() || (user.displayName || "") || (user.email || "").split("@")[0] || "User");
        setUserEmail(user.email || "");

        if (isAdmin) {
          setCollegeCode((data.collegeShort || "").trim() || "");
          setCollegeName((data.collegeName || "").trim() || "");
        } else {
          const adminUid = data.collegeAdminUid || null;
          if (adminUid) {
            const adminSnap = await getDoc(doc(db, "users", adminUid));
            const adminData = adminSnap.exists() ? adminSnap.data() : {};
            setCollegeCode((adminData.collegeShort || "").trim() || "");
            setCollegeName((adminData.collegeName || "").trim() || "");
          }
        }

        // Load my tickets (sort by createdAt desc in memory to avoid composite index)
        const ticketsQ = query(
          collection(db, "supportTickets"),
          where("uid", "==", user.uid)
        );
        const ticketsSnap = await getDocs(ticketsQ);
        const list = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return tb - ta;
        });
        const tickets = list.slice(0, 20);
        setMyTickets(tickets);

        const map = {};
        await Promise.all(
          tickets.map(async (t) => {
            const snap = await getDocs(collection(db, "supportTickets", t.id, "messages"));
            const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            map[t.id] = sortMessages(msgs);
          })
        );
        setTicketMessagesMap(map);
      } catch (err) {
        console.error(err);
        setError("Failed to load your profile.");
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  // Live listeners for each ticket's messages (replies show without refresh)
  const ticketIds = useMemo(() => myTickets.map((t) => t.id), [myTickets]);
  useEffect(() => {
    if (ticketIds.length === 0) return;
    const unsubs = ticketIds.map((id) =>
      onSnapshot(
        collection(db, "supportTickets", id, "messages"),
        (snap) => {
          const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setTicketMessagesMap((prev) => ({
            ...prev,
            [id]: sortMessages(msgs),
          }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [ticketIds.join(",")]);

  const loadMessagesForTickets = async (tickets) => {
    const map = {};
    await Promise.all(
      (tickets || []).map(async (t) => {
        const snap = await getDocs(collection(db, "supportTickets", t.id, "messages"));
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        map[t.id] = sortMessages(msgs);
      })
    );
    setTicketMessagesMap((prev) => ({ ...prev, ...map }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const subj = (subject || "").trim();
    const desc = (description || "").trim();
    if (!subj || !desc) {
      setError("Subject and description are required.");
      return;
    }
    setError("");
    setSuccess("");
    setSubmitLoading(true);
    try {
      await addDoc(collection(db, "supportTickets"), {
        uid: auth.currentUser.uid,
        userName: userName || "—",
        userEmail: userEmail || "—",
        userRole: userRole || "—",
        collegeCode: (collegeCode || "").trim() || "—",
        collegeName: (collegeName || "").trim() || "—",
        subject: subj,
        description: desc,
        status: "open",
        createdAt: serverTimestamp(),
      });
      setSubject("");
      setDescription("");
      setSuccess("Ticket raised successfully. We will get back to you soon.");
      setShowRaiseForm(false);

      // Refresh my tickets
      const ticketsQ = query(
        collection(db, "supportTickets"),
        where("uid", "==", auth.currentUser.uid)
      );
      const ticketsSnap = await getDocs(ticketsQ);
      const list = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      const tickets = list.slice(0, 20);
      setMyTickets(tickets);
      await loadMessagesForTickets(tickets);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to submit ticket.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSendReply = async (e, ticketId) => {
    e.preventDefault();
    const text = (replyText || "").trim();
    if (!text || !ticketId) return;
    setReplyLoading(true);
    try {
      await addDoc(collection(db, "supportTickets", ticketId, "messages"), {
        senderRole: userRole || "college",
        senderName: userName || "—",
        text,
        createdAt: serverTimestamp(),
      });
      setReplyText("");
      setReplyingToId(null);
      // Live listener will update ticketMessagesMap
    } catch (err) {
      console.error(err);
    } finally {
      setReplyLoading(false);
    }
  };

  const formatDate = (v) => {
    if (!v?.toDate) return "—";
    return v.toDate().toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/college/dashboard/manage"
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            ← Back to Manage
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-800 mb-2">Support</h1>
        <p className="text-gray-600 mb-6">
          Get help or report issues. Raise a ticket and we will get back to you.
        </p>

        {!showRaiseForm ? (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowRaiseForm(true)}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-md"
            >
              Raise a ticket
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Raise a ticket</h2>
              <button
                type="button"
                onClick={() => setShowRaiseForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Cancel
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              College: <span className="font-mono font-medium text-gray-700">{collegeCode || "—"}</span>
              {collegeName && (
                <span className="ml-2 text-gray-600">({collegeName})</span>
              )}
              {" · "}
              You: <span className="font-medium text-gray-700">{userName}</span>
              {userEmail && <span className="text-gray-500"> · {userEmail}</span>}
              {" · "}
              <span className="text-gray-500">{userRole || "—"}</span>
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {success && <p className="text-green-600 text-sm">{success}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief subject of your issue"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your issue or request in detail..."
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRaiseForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? "Submitting..." : "Submit ticket"}
                </button>
              </div>
            </form>
          </div>
        )}

        {myTickets.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Your recent tickets</h2>
            <ul className="space-y-6">
              {myTickets.map((t) => {
                const messages = ticketMessagesMap[t.id] || [];
                const isReplying = replyingToId === t.id;
                return (
                  <li
                    key={t.id}
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50/50"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-medium text-gray-800">{t.subject}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {formatDate(t.createdAt)} ·{" "}
                          <span className={t.status === "open" ? "text-amber-600 font-medium" : "text-green-600 font-medium"}>
                            {t.status}
                          </span>
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{t.description}</p>

                    {messages.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Conversation</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`p-2 rounded-lg text-sm ${
                                msg.senderRole === "superadmin"
                                  ? "bg-blue-100 text-blue-900"
                                  : "bg-gray-200 text-gray-800"
                              }`}
                            >
                              <span className="font-medium text-xs text-gray-500">{msg.senderName}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {msg.createdAt?.toDate?.()?.toLocaleString?.() ?? ""}
                              </span>
                              <p className="mt-1 whitespace-pre-wrap">{msg.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {t.status === "open" && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        {!isReplying ? (
                          <button
                            type="button"
                            onClick={() => setReplyingToId(t.id)}
                            className="text-sm text-blue-600 hover:underline font-medium"
                          >
                            Reply to this ticket
                          </button>
                        ) : (
                          <form onSubmit={(e) => handleSendReply(e, t.id)} className="flex gap-2">
                            <input
                              type="text"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Type your reply..."
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              disabled={replyLoading}
                              autoFocus
                            />
                            <button
                              type="submit"
                              disabled={replyLoading || !replyText.trim()}
                              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                              {replyLoading ? "Sending..." : "Send"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setReplyingToId(null); setReplyText(""); }}
                              className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-100"
                            >
                              Cancel
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* FAQ Section – application: admission, analytics, support tickets */}
        <div className="bg-white rounded-xl shadow-md p-6 mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {[
              {
                q: "How do I create or add student admissions?",
                a: "Go to Manage → Students. You can add students one by one or use bulk upload (CSV/Excel). Ensure your college code is set in Settings. Each student gets login credentials and can take tests under your college.",
              },
              {
                q: "Where do I see analytics and reports?",
                a: "Use Dashboard for overview (attempts, results). Go to Reports for class-wise and student-wise performance. Leaderboard shows rankings. For RankSprint default tests, use Manage → RankSprint Test to see test-wise analytics and attempts.",
              },
              {
                q: "How do I raise a support ticket?",
                a: "Click 'Raise a ticket' on this page, enter a subject and description, then submit. Your college code and name are sent automatically. Use this for technical issues, access problems, or feature requests.",
              },
              {
                q: "How do ticket messages and replies work?",
                a: "After raising a ticket, you will see a conversation thread. Support can reply; you see new messages in real time without refreshing. For open tickets, click 'Reply to this ticket' to add your message. Resolved tickets are read-only.",
              },
              {
                q: "How do I manage classes and assign students?",
                a: "Go to Manage → Classes. Create or edit classes, then add students to each class. Class-wise results and analytics are available in Reports so you can track performance by class.",
              },
            ].map((faq, index) => (
              <FAQItem key={index} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left font-medium text-gray-800 hover:bg-gray-50 transition"
      >
        <span>{question}</span>
        <span className="text-gray-400 text-xl shrink-0 ml-2">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-gray-50 text-gray-600 text-sm border-t border-gray-200">
          {answer}
        </div>
      )}
    </div>
  );
}
