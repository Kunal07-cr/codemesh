# Literature Survey

Project title: **CodeMesh: Graph-Assisted Repository Understanding and AI-Supported Real-Time Collaborative Development**

Objective: To investigate whether graph-assisted retrieval and awareness of current workspace edits improve repository-grounded AI assistance within a real-time collaborative development environment.

This survey uses accessible primary sources where available. It separates what CodeMesh implements from what it adapts or uses only as motivation.

## Surveyed Papers

### Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks

- Authors: Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Kuttler, Mike Lewis, Wen-tau Yih, Tim Rocktaschel, Sebastian Riedel, Douwe Kiela.
- Venue/year: NeurIPS 2020.
- Source: https://papers.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html
- Problem: Parametric language models cannot reliably expose, update, or cite external knowledge.
- Methodology: Combines a pretrained seq2seq generator with retrieved passages from a dense non-parametric index.
- Findings supported by source: The authors report stronger results on several knowledge-intensive NLP tasks and more factual/specific generation than a parametric-only baseline.
- Scope boundary: This is not a live code collaboration system and does not evaluate repository patch review.
- CodeMesh relation: Adapts the retrieval-plus-generation pattern and citation discipline, not the exact RAG architecture.

### RepoCoder: Repository-Level Code Completion Through Iterative Retrieval and Generation

- Authors: Fengji Zhang, Bei Chen, Yue Zhang, Jacky Keung, Jin Liu, Daoguang Zan, Yi Mao, Jian-Guang Lou, Weizhu Chen.
- Venue/year: EMNLP 2023.
- Source: https://aclanthology.org/2023.emnlp-main.151/
- Problem: Code completion often needs useful context scattered across repository files.
- Methodology: Similarity-based retrieval plus pretrained code LM in an iterative retrieval-generation pipeline.
- Findings supported by source: The ACL abstract reports over 10% improvement over an in-file baseline across settings and introduces RepoBench.
- Scope boundary: Code completion differs from question answering, collaborative editing, and patch review.
- CodeMesh relation: Adapts repository-context retrieval motivation and evaluation separation.

### GraphCodeBERT: Pre-Training Code Representations with Data Flow

- Authors: Daya Guo et al.
- Venue/year: ICLR 2021.
- Source: https://mlanthology.org/iclr/2021/guo2021iclr-graphcodebert/
- Problem: Token-only code models ignore structure important to code semantics.
- Methodology: Uses data-flow information during pretraining with structure-aware objectives.
- Findings supported by source: The source reports improvements on code search, clone detection, translation, and refinement.
- Scope boundary: Data-flow pretraining is not the same as CodeMesh's import/symbol graph.
- CodeMesh relation: Draws motivation from structural code representations; does not implement GraphCodeBERT.

### RepoGraph: Enhancing AI Software Engineering with Repository-Level Code Graph

- Authors: Siru Ouyang, Wenhao Yu, Kaixin Ma, Zilin Xiao, Zhihan Zhang, Mengzhao Jia, Jiawei Han, Hongming Zhang, Dong Yu.
- Venue/year: ICLR 2025.
- Source: https://proceedings.iclr.cc/paper_files/paper/2025/hash/4a4a3c197deac042461c677219efd36c-Abstract-Conference.html
- Problem: AI software engineering requires repository-level understanding beyond function/file-level coding.
- Methodology: A plug-in repository-level graph module used to guide AI software engineering systems.
- Findings supported by source: The authors report improved performance when plugged into multiple systems and evaluate on SWE-bench and CrossCodeEval.
- Scope boundary: CodeMesh adapts the idea of graph-assisted context, not the authors' implementation or results.
- CodeMesh relation: Adapts bounded graph-neighborhood retrieval as one experimental retrieval mode.

### Conflict-Free Replicated Data Types

- Authors: Marc Shapiro, Nuno Preguica, Carlos Baquero, Marek Zawirski.
- Venue/year: SSS 2011.
- Source: https://perso.lip6.fr/Marc.Shapiro/papers/2011/CRDTs_SSS-2011.pdf
- Problem: Eventual consistency systems need principled convergence under concurrent updates.
- Methodology: Formalizes state-based and operation-based CRDT conditions for strong eventual consistency.
- Findings supported by source: The paper defines sufficient conditions under which replicas converge.
- Scope boundary: Convergent text does not guarantee syntactically valid or semantically correct code.
- CodeMesh relation: Uses Yjs CRDTs for collaborative text convergence and explicitly relies on review/tests for correctness.

### Yjs: A Framework for Near Real-Time P2P Shared Editing on Arbitrary Data Types

- Authors: Petru Nicolaescu, Kevin Jahns, Michael Derntl, Ralf Klamma.
- Venue/year: ICWE 2015.
- Source: https://link.springer.com/chapter/10.1007/978-3-319-19890-3_55
- Problem: Shared editing needs near real-time synchronization of arbitrary data types.
- Methodology: Presents the Yjs framework for shared editing.
- Findings supported by source: The accessible abstract describes near real-time shared editing over arbitrary data types.
- Scope boundary: Current Yjs implementation details should be taken from current official docs, not only the 2015 paper.
- CodeMesh relation: Implements current Yjs documents as the authority for workspace text.

### CodeCity: 3D Visualization of Large-Scale Software

- Authors: Richard Wettel and Michele Lanza.
- Venue/year: ICSE Companion 2008.
- Source: https://www.inf.usi.ch/lanza/PUBS/P/Wett2008a.pdf
- Problem: Large software systems are difficult to comprehend.
- Methodology: Interactive 3D city metaphor mapping classes and packages to buildings and districts.
- Findings supported by source: The authors describe CodeCity as a language-independent interactive visualization used on large industrial systems.
- Scope boundary: A city metaphor does not validate CodeMesh's dependency graph UI.
- CodeMesh relation: Draws motivation from interactive visualization for comprehension; CodeMesh implements a 2D dependency/symbol graph.

### SWE-bench: Can Language Models Resolve Real-World GitHub Issues?

- Authors: Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik R. Narasimhan.
- Venue/year: ICLR 2024.
- Source: https://www.swebench.com/citations.html
- Problem: Evaluate whether language models can resolve real-world GitHub issues.
- Methodology: Benchmark using real issues and repository tests.
- Findings supported by source: The citation page identifies the ICLR 2024 paper and benchmark family.
- Scope boundary: CodeMesh's small evaluation is not SWE-bench and must not be reported as such.
- CodeMesh relation: Uses SWE-bench as motivation for patch-task evaluation with executable checks.

## Comparison Table

| Work | Retrieval | Code Graphs | Collaboration | Visualization | Evaluation |
| --- | --- | --- | --- | --- | --- |
| RAG | Dense retrieval for NLP context | No code graph | No | No | QA and generation tasks |
| RepoCoder | Repository context retrieval | No explicit UI graph | No | No | RepoBench completion |
| GraphCodeBERT | Learned representations | Data-flow structure | No | No | Code tasks |
| RepoGraph | Graph-guided context | Repository-level graph | No | Not a portal UI | SWE-bench, CrossCodeEval |
| CRDTs | No | No | Formal convergence | No | Theoretical conditions |
| Yjs paper | No | No | Shared editing | No | Framework demonstration |
| CodeCity | No | Structural metaphor | No | 3D city visualization | Case applications |
| SWE-bench | No direct RAG method | No | No | No | Real GitHub issue benchmark |

## Research Positioning

CodeMesh is an engineering integration with a research hypothesis. It does not claim firstness. The implemented prototype currently supports vector-only, hybrid, and graph-expanded retrieval over a seeded TypeScript repository. It records retrieval rows for a small evaluation dataset, but results are preliminary and not statistically sufficient.
