import NavBar from '@/components/NavBar';

export default function AuthenticatedLayout({ children }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  );
}
