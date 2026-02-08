"use client";

import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X } from "lucide-react";

export default function SuperAdminSupportPage() {
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportTicketsLoading, setSupportTicketsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [ticketMessagesLoading, setTicketMessagesLoading] = useState(false);
  const [ticketReplyText, setTicketReplyText] = useState("");
  const [ticketActionLoading, setTicketActionLoading] = useState(false);

  const fetchSupportTickets = async () => {
    setSupportTicketsLoading(true);
    try {
      const snap = await getDocs(collection(db, "supportTickets"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      setSupportTickets(list);
    } catch (err) {
      console.error(err);
    } finally {
      setSupportTicketsLoading(false);
    }
  };

  useEffect(() => {
    fetchSupportTickets();
  }, []);

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setTicketReplyText("");
    setTicketMessages([]);
    setTicketMessagesLoading(true);
  };

  useEffect(() => {
    if (!selectedTicket?.id) {
      setTicketMessages([]);
      setTicketMessagesLoading(false);
      return;
    }
    setTicketMessagesLoading(true);
    const unsub = onSnapshot(
      collection(db, "supportTickets", selectedTicket.id, "messages"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return ta - tb;
        });
        setTicketMessages(list);
        setTicketMessagesLoading(false);
      },
      (err) => {
        console.error(err);
        setTicketMessagesLoading(false);
      }
    );
    return () => unsub();
  }, [selectedTicket?.id]);

  const closeTicketModal = () => {
    setSelectedTicket(null);
    setTicketMessages([]);
    setTicketReplyText("");
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket?.id) return;
    setTicketActionLoading(true);
    try {
      await updateDoc(doc(db, "supportTickets", selectedTicket.id), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
      });
      setSelectedTicket((prev) => (prev ? { ...prev, status: "resolved" } : null));
      fetchSupportTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setTicketActionLoading(false);
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket?.id) return;
    setTicketActionLoading(true);
    try {
      await updateDoc(doc(db, "supportTickets", selectedTicket.id), {
        status: "open",
        resolvedAt: null,
      });
      setSelectedTicket((prev) => (prev ? { ...prev, status: "open" } : null));
      fetchSupportTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setTicketActionLoading(false);
    }
  };

  const handleSendTicketReply = async (e) => {
    e.preventDefault();
    const text = (ticketReplyText || "").trim();
    if (!text || !selectedTicket?.id) return;
    setTicketActionLoading(true);
    try {
      await addDoc(collection(db, "supportTickets", selectedTicket.id, "messages"), {
        senderRole: "superadmin",
        senderName: "Super Admin",
        text,
        createdAt: serverTimestamp(),
      });
      setTicketReplyText("");
    } catch (err) {
      console.error(err);
    } finally {
      setTicketActionLoading(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!selectedTicket?.id) return;
    if (!confirm(`Delete ticket "${selectedTicket.subject}"? This cannot be undone.`)) return;
    setTicketActionLoading(true);
    try {
      const messagesSnap = await getDocs(
        collection(db, "supportTickets", selectedTicket.id, "messages")
      );
      for (const msgDoc of messagesSnap.docs) {
        await deleteDoc(msgDoc.ref);
      }
      await deleteDoc(doc(db, "supportTickets", selectedTicket.id));
      closeTicketModal();
      await fetchSupportTickets();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to delete ticket.");
    } finally {
      setTicketActionLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Support</h1>
        <p className="text-gray-600 mt-1">Tickets raised by college admins or users. Reply, resolve or reopen.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="font-bold text-lg mb-4">Support Tickets</h2>
        <p className="text-sm text-gray-500 mb-4">
          Each ticket includes college code, user name, and full description. Click to open, reply or mark resolved.
        </p>
        {supportTicketsLoading ? (
          <p className="text-gray-500">Loading tickets...</p>
        ) : supportTickets.length === 0 ? (
          <p className="text-gray-500">No support tickets yet.</p>
        ) : (
          <div className="space-y-4">
            {supportTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => openTicket(ticket)}
                className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 cursor-pointer hover:bg-gray-100/80 transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3 pb-3 border-b border-gray-200">
                  <div>
                    <p className="font-semibold text-gray-900">{ticket.subject}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-mono font-medium text-blue-700">{ticket.collegeCode || "—"}</span>
                      {ticket.collegeName && (
                        <span className="ml-2 text-gray-600">({ticket.collegeName})</span>
                      )}
                      {" · "}
                      <span className="font-medium text-gray-700">{ticket.userName || "—"}</span>
                      {ticket.userEmail && (
                        <span className="text-gray-500"> · {ticket.userEmail}</span>
                      )}
                      {" · "}
                      <span className="text-gray-500">{ticket.userRole || "—"}</span>
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-500">
                      {ticket.createdAt?.toDate?.()?.toLocaleString?.() ?? "—"}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                        ticket.status === "open"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {ticket.status || "open"}
                    </span>
                  </div>
                </div>
                <div className="text-gray-700 whitespace-pre-wrap">{ticket.description || "—"}</div>
                <p className="text-xs text-blue-600 mt-2">Click to open, resolve or reply →</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticket detail modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <h2 className="text-xl font-bold">Ticket: {selectedTicket.subject}</h2>
              <button
                type="button"
                onClick={closeTicketModal}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X size={22} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div className="text-sm text-gray-600">
                <span className="font-mono font-medium text-blue-700">{selectedTicket.collegeCode || "—"}</span>
                {selectedTicket.collegeName && ` (${selectedTicket.collegeName})`}
                {" · "}
                {selectedTicket.userName || "—"}
                {selectedTicket.userEmail && ` · ${selectedTicket.userEmail}`}
                {" · "}
                {selectedTicket.userRole || "—"}
                {" · "}
                {selectedTicket.createdAt?.toDate?.()?.toLocaleString?.() ?? "—"}
                <span
                  className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                    selectedTicket.status === "open"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {selectedTicket.status || "open"}
                </span>
              </div>
              <div className="text-gray-700 whitespace-pre-wrap border-b pb-4">{selectedTicket.description || "—"}</div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Conversation</h3>
                {ticketMessagesLoading ? (
                  <p className="text-gray-500 text-sm">Loading...</p>
                ) : ticketMessages.length === 0 ? (
                  <p className="text-gray-500 text-sm">No messages yet. Send a reply below.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {ticketMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-2 rounded-lg text-sm ${
                          msg.senderRole === "superadmin"
                            ? "bg-blue-100 text-blue-900 ml-4"
                            : "bg-gray-100 text-gray-800 mr-4"
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
                )}
              </div>

              <form onSubmit={handleSendTicketReply} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  value={ticketReplyText}
                  onChange={(e) => setTicketReplyText(e.target.value)}
                  placeholder="Type a reply..."
                  className="flex-1 px-3 py-2 border rounded-lg"
                  disabled={ticketActionLoading}
                />
                <button
                  type="submit"
                  disabled={ticketActionLoading || !ticketReplyText.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Send
                </button>
              </form>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {selectedTicket.status === "open" ? (
                  <button
                    type="button"
                    onClick={handleResolveTicket}
                    disabled={ticketActionLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReopenTicket}
                    disabled={ticketActionLoading}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                  >
                    Reopen ticket
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteTicket}
                  disabled={ticketActionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Delete ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
