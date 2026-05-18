import { DanslatorForm } from '@/components/danslator-form';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <h1>Danslator</h1>
        <p>
          Translate PDFs between English and Malay while preserving layout and optionally translating text found inside images.
        </p>
      </section>
      <DanslatorForm />
    </main>
  );
}
