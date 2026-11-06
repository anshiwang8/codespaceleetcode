# rich-find-001: The column that refreshes less often

**Answer:** `TimeRemainingColumn` (`rich/progress.py#TimeRemainingColumn`)

## How a strong engineer gets there

The prompt describes behavior ("hands back its previous output"), not a name, so start from the mechanism instead of guessing which column it might be.

1. Open `rich/progress.py` and find the base class every column derives from, `ProgressColumn` (line 507). A `Progress` display does not call `render` on a column directly. It calls the column object itself, so read `ProgressColumn.__call__`.
2. `__call__` only consults its cache when a class attribute is set:

   ```python
   # rich/progress.py, lines 530-541
   current_time = task.get_time()
   if self.max_refresh is not None and not task.completed:
       try:
           timestamp, renderable = self._renderable_cache[task.id]
       except KeyError:
           pass
       else:
           if timestamp + self.max_refresh > current_time:
               return renderable

   renderable = self.render(task)
   self._renderable_cache[task.id] = (current_time, renderable)
   ```

3. The base class declares `max_refresh: Optional[float] = None` (line 510), so by default the cache is never used. Now the question becomes "which subclass overrides `max_refresh`?". Searching the file for `max_refresh` gives exactly three hits: the declaration, the check in `__call__`, and line 781:

   ```python
   # rich/progress.py, lines 772 and 781
   class TimeRemainingColumn(ProgressColumn):
       ...
       max_refresh = 0.5
   ```

So while its task runs, the time-remaining estimate is redrawn at most twice a second. Every other built-in column re-renders on every refresh.

## Why the other columns are wrong

| Column | Why it isn't the answer |
|---|---|
| `ProgressColumn` | It implements the cache, but its own `max_refresh` is `None`, and the prompt asks for the concrete column. |
| `SpinnerColumn` | It animates at its own `speed`, but it never sets `max_refresh`, so `__call__` renders it every time. |
| `TransferSpeedColumn`, `DownloadColumn` | They show fast-changing numbers that look like candidates for throttling, but neither sets `max_refresh`. |
| `TaskProgressColumn` | It derives from `TextColumn`, and neither class sets `max_refresh`. |
| `TimeElapsedColumn` | It is the sibling of the answer, but only the *remaining* estimate is throttled. |

## Why the code is shaped this way

The time-remaining estimate is computed from a recent speed sample, so it jitters from frame to frame. Rather than special-casing one column inside `Progress`, Rich puts a small, opt-in cache in the base class. Any column can turn it on by setting one class attribute. Note the guard is `not task.completed`, and `completed` is the task's numeric progress count, not a finished flag. So the cache only applies while that count is still 0; once any progress is recorded the column re-renders on every refresh. It is keyed by `task.id`, because one column object renders a cell for every task.

## Takeaways

- When a behavior is described rather than named, find the shared code path every candidate goes through (here `__call__`) and look for the switch it reads.
- A class attribute that defaults to `None` on a base class is a common Python extension point. Searching for the attribute's name finds every override quickly.
