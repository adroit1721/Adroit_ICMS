import { redirect } from 'next/navigation';

export default function PayFeesPrivateRedirect() {
  redirect('/student/login');
}
