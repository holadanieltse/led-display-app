import { PageHeader } from '../components/ui/PageHeader'

type Props = { title: string }

export default function PlaceholderPage({ title }: Props) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="mx-6 mt-6 p-12 rounded-md bg-white border border-gray-200 text-center">
        <div className="text-4xl mb-4">🛠️</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">{title} — Coming Soon</h2>
        <p className="text-gray-500">
          This page is under development. Start with{' '}
          <a href="/organizations" className="text-brand-600 hover:underline font-medium">
            Organization Management
          </a>{' '}
          for the MVP experience.
        </p>
      </div>
    </div>
  )
}
