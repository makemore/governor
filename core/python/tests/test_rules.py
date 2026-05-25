"""
Behavioural tests for the governor-core rule evaluator.

These double as living examples of the DSL and should track the
conformance vectors in `governor/spec/conformance/` once those exist.
"""
from governor_core.rules import evaluate, explain


A_HUMAN = {'actor_id': 'a1', 'actor_kind': 'human'}
A_AGENT = {'actor_id': 'a2', 'actor_kind': 'agent'}
A_SERVICE = {'actor_id': 'a3', 'actor_kind': 'service'}
ROLES = {
    'a1': {'reviewer', 'release-manager'},
    'a2': {'qa'},
}


class TestEmptyAndMalformed:
    def test_empty_dict_is_unsatisfied(self):
        assert evaluate({}, [A_HUMAN], ROLES) is False

    def test_none_is_unsatisfied(self):
        assert evaluate(None, [A_HUMAN], ROLES) is False

    def test_unknown_key_is_unsatisfied(self):
        assert evaluate({'nonsense': True}, [A_HUMAN], ROLES) is False


class TestLeaves:
    def test_any_actor(self):
        assert evaluate({'actor': True}, [A_HUMAN], ROLES) is True
        assert evaluate({'actor': True}, [], ROLES) is False

    def test_actor_with_role_hit(self):
        assert evaluate({'actor_with_role': 'reviewer'}, [A_HUMAN], ROLES) is True

    def test_actor_with_role_miss(self):
        assert evaluate({'actor_with_role': 'release-manager'}, [A_AGENT], ROLES) is False

    def test_actor_with_kind(self):
        assert evaluate({'actor_with_kind': 'human'}, [A_HUMAN, A_AGENT], ROLES) is True
        assert evaluate({'actor_with_kind': 'service'}, [A_HUMAN, A_AGENT], ROLES) is False

    def test_actor_is(self):
        assert evaluate({'actor_is': 'a1'}, [A_HUMAN], ROLES) is True
        assert evaluate({'actor_is': 'a99'}, [A_HUMAN], ROLES) is False


class TestCombinators:
    def test_all_of(self):
        rule = {'all_of': [
            {'actor_with_kind': 'human'},
            {'actor_with_role': 'reviewer'},
        ]}
        assert evaluate(rule, [A_HUMAN], ROLES) is True
        assert evaluate(rule, [A_AGENT], ROLES) is False

    def test_any_of(self):
        rule = {'any_of': [
            {'actor_with_role': 'compliance-officer'},
            {'actor_with_role': 'qa'},
        ]}
        assert evaluate(rule, [A_AGENT], ROLES) is True
        assert evaluate(rule, [A_SERVICE], ROLES) is False

    def test_n_of_satisfied_by_one_actor_with_multiple_roles(self):
        rule = {'n_of': {'count': 2, 'of': [
            {'actor_with_role': 'reviewer'},
            {'actor_with_role': 'release-manager'},
            {'actor_with_role': 'security-officer'},
        ]}}
        # a1 holds both 'reviewer' and 'release-manager'.
        assert evaluate(rule, [A_HUMAN], ROLES) is True

    def test_n_of_unsatisfied(self):
        rule = {'n_of': {'count': 2, 'of': [
            {'actor_with_role': 'reviewer'},
            {'actor_with_role': 'security-officer'},
        ]}}
        assert evaluate(rule, [A_HUMAN], ROLES) is False


class TestExplain:
    def test_explain_mirrors_evaluate(self):
        rule = {'all_of': [
            {'actor_with_kind': 'human'},
            {'actor_with_role': 'qa'},
        ]}
        out = explain(rule, [A_HUMAN], ROLES)
        assert out['satisfied'] is False
        assert len(out['children']) == 2
        assert out['children'][0]['satisfied'] is True   # is human
        assert out['children'][1]['satisfied'] is False  # a1 doesn't have qa

    def test_explain_n_of_walks_branches(self):
        rule = {'n_of': {'count': 1, 'of': [
            {'actor_with_role': 'qa'},
            {'actor_with_role': 'release-manager'},
        ]}}
        out = explain(rule, [A_HUMAN], ROLES)
        assert out['satisfied'] is True
        assert [c['satisfied'] for c in out['children']] == [False, True]
