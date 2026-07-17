export type InlineOption = { id: string; name: string }

export function addAndSelectOption<T extends InlineOption>(options: T[], created: T) {
  return {
    options: [...options.filter((option) => option.id !== created.id), created],
    selectedId: created.id,
  }
}
