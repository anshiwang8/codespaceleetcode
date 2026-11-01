# fastapi-architecture-002: Kinds of request parameters

**Answer:** `Path`, `Query`, `Header`, `Cookie` in `fastapi/params.py`.

## How to find it

1. List the `class` statements in `fastapi/params.py`: `ParamTypes(Enum)`, `Param(FieldInfo)`, `Path(Param)`, `Query(Param)`, `Header(Param)`, `Cookie(Param)`, `Body(FieldInfo)`, `Form(Body)`, `File(Form)`, `Depends`, `Security(Depends)`.
2. The two FieldInfo-derived roots are `Param` and `Body`. The classes that directly extend `Param` are the four answers.
3. `ParamTypes` has the matching members (query, header, path, cookie), which `analyze_param` in `fastapi/dependencies/utils.py` uses to route each field into `Dependant.path_params`, `query_params`, `header_params` or `cookie_params`.

## Why the others are wrong

- `Param` is the base itself, not a subclass of itself.
- `Body`, `Form` and `File` are in the body hierarchy.
- `Depends` and `Security` are not FieldInfo classes; they describe dependencies.
- `ParamTypes` is an enum.
