import logo from "@/assets/vibtune-logo.png";

export function VibtuneLogo({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src={logo} alt="Vibtune — Feel the Vibe" className={className} />;
}
