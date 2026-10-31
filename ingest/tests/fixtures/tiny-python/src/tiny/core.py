"""Module-level functions, decorators, lambdas and nesting."""

import functools

LIMIT = 10

SETTINGS = {
    "retries": 3,
    "timeout": 30,
}


def log_calls(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        helper(0)
        return fn(*args, **kwargs)

    return wrapper


def helper(value):
    return value + LIMIT


@log_calls
def decorated(value):
    return helper(value)


def outer(value):
    def inner(other):
        return helper(other)

    return inner(value)


double = lambda value: helper(value) * 2


def label():
    return "😀 grin" + emoji_name()


def emoji_name():
    return "😀"
