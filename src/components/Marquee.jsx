export default function Marquee({ items = [] }) {
  if (!items || items.length === 0) return null;

  const repeatedItems = [...items, ...items, ...items, ...items];

  return (
    <div className="relative overflow-hidden border-y border-[#27272a] bg-[#080808] py-2.5">
      <div className="flex w-max animate-marquee space-x-8 whitespace-nowrap">
        {repeatedItems.map((item, index) => (
          <div key={index} className="flex items-center gap-8 font-mono text-xs tracking-widest text-zinc-400">
            <span className="text-[#e5ff00]">⚡</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
