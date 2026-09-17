'use client';

import { useState } from 'react';

function normalize(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function VerifyBookForm({ book, verifyBook }) {
  const needsChoice = Boolean(book.amazon_cover_url);
  const [coverChoice, setCoverChoice] = useState(null);
  const [title, setTitle] = useState(book.title || '');
  const [author, setAuthor] = useState(book.author || '');
  const canSubmit = !needsChoice || coverChoice !== null;

  const titleMismatch = Boolean(book.amazon_title) && normalize(title) !== normalize(book.amazon_title);
  const authorMismatch = Boolean(book.amazon_author) && normalize(author) !== normalize(book.amazon_author);

  return (
    <form action={verifyBook} className="flex gap-4">
      <input type="hidden" name="bookId" value={book.id} />
      {coverChoice && <input type="hidden" name="coverChoice" value={coverChoice} />}

      <div className="flex flex-none gap-1.5">
        <label className="flex flex-col items-center gap-1">
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.cover_url} alt="" className="h-32 w-24 rounded-md object-cover" />
          ) : (
            <div className="flex h-32 w-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
              Sin portada
            </div>
          )}
          <span className="text-[10px] text-slate-400">Usuario</span>
          {needsChoice && (
            <span className="flex items-center gap-1 text-[11px] text-slate-600">
              <input
                type="radio"
                checked={coverChoice === 'own'}
                onChange={() => setCoverChoice('own')}
              />
              Usar esta
            </span>
          )}
        </label>
        <label className="flex flex-col items-center gap-1">
          {book.amazon_cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.amazon_cover_url} alt="" className="h-32 w-24 rounded-md object-cover" />
          ) : (
            <div className="flex h-32 w-24 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
              Sin Amazon
            </div>
          )}
          <span className="text-[10px] text-slate-400">Amazon</span>
          {needsChoice && (
            <span className="flex items-center gap-1 text-[11px] text-slate-600">
              <input
                type="radio"
                checked={coverChoice === 'amazon'}
                onChange={() => setCoverChoice('amazon')}
              />
              Usar esta
            </span>
          )}
        </label>
      </div>

      <div className="min-w-0 flex-1">
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`w-full rounded-md border px-2 py-1 text-sm font-medium ${
            titleMismatch ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-900'
          }`}
        />
        {titleMismatch && <p className="mt-0.5 text-xs text-red-600">Amazon: {book.amazon_title}</p>}

        <input
          name="author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className={`mt-1 w-full rounded-md border px-2 py-1 text-sm ${
            authorMismatch ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'
          }`}
        />
        {authorMismatch && <p className="mt-0.5 text-xs text-red-600">Amazon: {book.amazon_author}</p>}

        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
          <div>
            <dt className="inline font-medium">ISBN: </dt>
            <dd className="inline">{book.isbn13 || book.isbn || '—'}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Páginas: </dt>
            <dd className="inline">{book.pages ?? '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="inline font-medium">Alta manual: </dt>
            <dd className="inline">{book.manual_entry ? 'Sí' : 'No'}</dd>
          </div>
          {book.affiliate_url && (
            <div className="col-span-2 truncate">
              <dt className="inline font-medium">Afiliado: </dt>
              <dd className="inline">
                <a href={book.affiliate_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {book.affiliate_url}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3">
          <button
            type="submit"
            disabled={!canSubmit}
            title={canSubmit ? undefined : 'Elige qué portada usar antes de verificar'}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Verificar
          </button>
        </div>
      </div>
    </form>
  );
}
