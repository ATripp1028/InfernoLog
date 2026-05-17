import { SettingsSection, SettingStack } from '../components/SettingsSection'
import { ListPriorityList } from '../components/ListPriorityList'
import type { MeData } from '@/lib/api/me'

interface RankingSectionProps {
  me: MeData
}

export function RankingSection({ me }: RankingSectionProps) {
  return (
    <SettingsSection title="Ranking">
      <SettingStack
        label="List priority order"
        description="When auto-placing a new completion in your ranking, InfernoLog uses the first list source it finds a reference for, in this order."
      >
        <ListPriorityList me={me} />
      </SettingStack>
    </SettingsSection>
  )
}
