export interface Tool<TArgs, TResult> {
  name: string
  description: string
  execute(args: TArgs): Promise<TResult>
}
