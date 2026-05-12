type SearchParamsLike = {
  get: (key: string) => string | null
}

export const getSearchParam = (params: SearchParamsLike, key: string) =>
  params.get(key)?.trim() || ''

export const getEnumSearchParam = <T extends string>(
  params: SearchParamsLike,
  key: string,
  allowedValues: readonly T[],
  fallback: T
): T => {
  const value = getSearchParam(params, key)
  return allowedValues.includes(value as T) ? value as T : fallback
}

export const getBooleanSearchParam = (params: SearchParamsLike, key: string) =>
  getSearchParam(params, key).toLowerCase() === 'true'
