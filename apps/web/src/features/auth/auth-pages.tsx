import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { redirectToCentralLogin, requestCentralAppToken } from "../../api/client";

const getCentralMode = () => (window.location.pathname.includes("register") ? "register" : "login");

export const LoginPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    void requestCentralAppToken()
      .then(() => {
        if (mounted) void navigate({ to: "/onboarding", replace: true });
      })
      .catch(() => {
        if (mounted) redirectToCentralLogin(getCentralMode());
      });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-page text-sm font-black text-ink">
      Opening SK Auth...
    </div>
  );
};

export const RegisterPage = LoginPage;
export const ForgotPasswordPage = LoginPage;
export const GoogleCallbackPage = LoginPage;
