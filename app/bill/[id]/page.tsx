import { Suspense } from "react";
import BillDetail from "./BillDetail";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ keywords?: string; county?: string }>;
};

async function BillContent({ params, searchParams }: Props) {
  const { id } = await params;
  const { keywords = "", county = "" } = await searchParams;
  return <BillDetail billId={id} keywordIds={keywords} countyFips={county} />;
}

export default function BillPage(props: Props) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-black" />}>
      <BillContent {...props} />
    </Suspense>
  );
}