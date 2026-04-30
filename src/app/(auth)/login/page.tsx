"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@ispainting.com");
  const [password, setPassword] = useState("admin123");
  const login = api.auth.login.useMutation({
    onSuccess: ({ role }) => {
      toast.success("Welcome back");
      router.push(role === "admin" ? "/dashboard" : "/clock");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="card w-full max-w-sm p-6">
      <div className="text-center mb-6">
        <div className="text-lg font-bold text-brand-700">I.S PAINTING</div>
        <div className="text-sm text-slate-500">Sign in to continue</div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password });
        }}
        className="space-y-3"
      >
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>
        <button className="btn btn-primary w-full" disabled={login.isPending} type="submit">
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-slate-400 text-center pt-2">
          Default: admin@ispainting.com / admin123
        </p>
      </form>
    </div>
  );
}
