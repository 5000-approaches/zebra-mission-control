"use client";

import { signIn } from "next-auth/react";

export default function AuthPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="text-center w-full max-w-sm px-4">
        <div
          className="h-14 w-14 rounded-lg flex items-center justify-center font-semibold text-lg text-white mx-auto mb-8"
          style={{ background: "var(--accent)" }}
        >
          ZC
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Mission Control
        </h1>
        <p className="text-gray-500 mb-10">Sign in to continue</p>

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="font-medium text-base text-white px-8 py-3.5 rounded-lg w-full hover:opacity-90 transition-opacity"
          style={{ background: "var(--accent)" }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
