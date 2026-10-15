import { useApi } from "../../api";

export function useAvatarUrl(userId: string | undefined) {
	const api = useApi();
	if (!userId) return undefined;
	return `${api.baseUrl}/v1/account/avatar/${userId}`;
}
