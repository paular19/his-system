import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <div className="dashboard-shell flex min-h-screen bg-gray-50 print:block print:min-h-0 print:bg-white">
      <Sidebar />
      <div className="dashboard-main flex-1 pl-60 flex flex-col min-h-screen print:pl-0 print:min-h-0">
        <main className="flex-1 overflow-auto print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  )
}
