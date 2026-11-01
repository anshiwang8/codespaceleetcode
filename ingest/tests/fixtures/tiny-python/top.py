from tiny import make_session
from tiny.models import uses_session


def main():
    return uses_session(make_session())


main()
