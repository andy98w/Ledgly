import { redirect } from 'next/navigation';

export default function InboxPage() {
  redirect('/payments?tab=review');
}
