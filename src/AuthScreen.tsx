import type { ReactNode } from "react";
import { DesktopModeSwitch } from "./DesktopModeSwitch";
import "./hostToolbar.css";

type AuthScreenProps = {
  title: string;
  children: ReactNode;
};

/** Title bar and column shared by the hosted sign-in and sign-up pages. */
export function AuthScreen({ title, children }: AuthScreenProps) {
  return (
    <>
      <header className="titlebar">
        <a className="logo-btn" href="/dashboard" aria-label="Living Plan">
          <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
        </a>
        <h1 className="brand">Living Plan</h1>
        <div className="chrome-tools">
          <DesktopModeSwitch host="cloud" />
        </div>
      </header>
      <main className="account-card">
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}
