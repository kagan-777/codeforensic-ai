import UploadProject from "@/components/UploadProject";
import PageHero from "@/components/PageHero";
import Scene3D from "@/components/Scene3D";

export const metadata = { title: "Upload project · CODEFORENSIC AI" };

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHero
        eyebrow="NEW SCAN"
        title="Upload a project"
        subtitle="The ZIP is checked for unsafe paths and ZIP bombs, unpacked in memory and read as text only. The ZIP itself is not stored — only findings and short, redacted snippets."
        visual={<Scene3D scene="vault" />}
      />
      <UploadProject />
      <div className="glass rounded-2xl p-4 text-xs leading-relaxed text-muted">
        <p className="font-semibold text-text">What gets analyzed?</p>
        <p className="mt-1">
          Java, JavaScript, TypeScript, Python, SQL, HTML, JSON, YAML, .properties, .env and other config files (up to
          512 KB each, 2,000 files). Folders like node_modules, .git, dist, build, .next, target, venv and __pycache__
          are skipped, as are images, binaries and archives inside the ZIP.
        </p>
      </div>
    </div>
  );
}
