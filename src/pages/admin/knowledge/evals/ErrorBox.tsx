export default function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
      {message}
    </div>
  );
}
