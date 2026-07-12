import logoAsset from "@/assets/vibtune-logo.png.asset.json";

export function VibtuneLogo({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src={logoAsset.url} alt="Vibtune — Feel the Vibe" className={className} />;
}
