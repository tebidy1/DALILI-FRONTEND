import { useEffect, useState } from 'react'
import { client } from '../api'

/**
 * ب (ORG-04): أقسام المساحة الفعّالة كلها لمنتقي «قسم الدليل» — للمدير وحده.
 * إحصاء المكتبة لا يكفي: يذكر الأقسام التي فيها أدلة فقط. الفشل يخفي المنتقي ولا يكسر شيئاً.
 */
export function useAdminDepartments(isAdmin: boolean): { id: string; name: string }[] | null {
  const [teams, setTeams] = useState<{ id: string; name: string }[] | null>(null)
  useEffect(() => {
    if (!isAdmin || typeof client.listTeams !== 'function') {
      setTeams(null)
      return
    }
    const ac = new AbortController()
    client
      .listTeams(ac.signal)
      .then((list) => setTeams(list.length ? list.map((d) => ({ id: d.id, name: d.name })) : null))
      .catch(() => setTeams(null))
    return () => ac.abort()
  }, [isAdmin])
  return teams
}
