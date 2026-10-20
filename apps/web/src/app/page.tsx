import { redirect } from 'next/navigation';

import { HOME_PATH } from '@/shared';

export default function Home() {
  redirect(HOME_PATH);
}
