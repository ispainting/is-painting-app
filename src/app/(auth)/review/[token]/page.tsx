"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";

export default function ReviewPage({ params }: { params: { token: string } }) {
  const { data, isLoading } = api.reviews.byToken.useQuery({ token: params.token });
  const submit = api.reviews.submit.useMutation({
    onSuccess: (res) => {
      toast.success("Thanks for your feedback!");
      if (res.googleUrl) window.location.href = res.googleUrl;
    },
    onError: (e) => toast.error(e.message),
  });
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");

  if (isLoading) return <div className="card p-6">Loading…</div>;
  if (!data) return <div className="card p-6">Invalid review link.</div>;
  if (data.submittedAt) return <div className="card p-6">Thanks — your review is in!</div>;

  return (
    <div className="card w-full max-w-md p-6">
      <h1 className="text-xl font-semibold mb-2">How was our work?</h1>
      <p className="text-sm text-slate-500 mb-4">
        Hi {data.customer.name.split(" ")[0]}, please rate your experience with I.S Painting.
      </p>
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`w-10 h-10 rounded-full border ${
              n <= rating ? "bg-brand-600 text-white border-brand-600" : "bg-white"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        className="input min-h-[120px]"
        placeholder="Optional comments…"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <button
        className="btn btn-primary w-full mt-4"
        disabled={submit.isPending}
        onClick={() => submit.mutate({ token: params.token, rating, feedback })}
      >
        {submit.isPending ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
