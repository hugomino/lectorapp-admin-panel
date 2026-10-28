import { isbnStatus } from '@/lib/isbnStatus';
import { applyAmazonIsbn } from '@/app/(authenticated)/actions';

// Línea "ISBN de la base vs ISBN de Amazon". Va dentro de un <form> con el campo oculto bookId.
export default function IsbnCheck({ book }) {
  const status = isbnStatus(book);
  if (!status) return null;

  if (status.match) {
    return <p className="mt-1 text-xs text-emerald-700">ISBN coincide con Amazon ({status.amazon})</p>;
  }

  return (
    <div className="mt-1 text-xs text-red-600">
      <p>
        ISBN de la base: {status.own || '—'} · ISBN de Amazon: {status.amazon}
      </p>
      <p className="text-slate-500">Si el título y el autor son los correctos, puede ser solo otra edición.</p>
      <button
        type="submit"
        formAction={applyAmazonIsbn}
        className="mt-1 rounded-md border border-red-300 px-2 py-0.5 font-medium text-red-700 hover:bg-red-50"
      >
        Usar el ISBN de Amazon
      </button>
    </div>
  );
}
